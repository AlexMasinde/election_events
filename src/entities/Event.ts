import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { Participant } from './Participant';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  eventId: string;

  @Column({ type: 'varchar', length: 255 })
  eventName: string;

  @Column({ type: 'varchar', length: 255 })
  county: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  constituency: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ward: string | null;

  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, (user) => user.events)
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Participant, (participant) => participant.event)
  participants: Participant[];
}

